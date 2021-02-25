import AsyncEvent from "./AsyncEvent";
import ConcurrentQueue from "./ConcurrentQueue";
import NamedAsyncEvent from "./NamedAsyncEvent";
import ProducerConsumer from "./ProducerConsumer";
import Signal from "./Signal";

/**
 * 非同期ストリームを表します。
 */
interface AsyncStream<T> extends AsyncGenerator<T, void, void> {

	/**
	 * このストリームを別の型に写像した新たなストリームを作成します。
	 * @param fn 写像を行うコールバック関数。
	 * @returns 写像された新たなストリーム。
	 */
	map<U>(fn: (value: T) => (U | Promise<U>)): AsyncStream<U>;

	/**
	 * このストリームを濾過した新たなストリームを作成します。
	 * @param fn 濾過を行うコールバック関数。
	 * @returns 濾過された新たなストリーム。
	 */
	filter(fn: (value: T) => (boolean | Promise<boolean>)): AsyncStream<T>;
	
	/**
	 * このストリームと指定したジェネレータを合併し新たなストリームを返します。
	 * @param generators 合併するジェネレータ。
	 * @returns 合併された新たなストリーム。
	 */
	mergeWith(...generators: AsyncGenerator<T, void, void>[]): AsyncStream<T>;

	// TODO:
	// duplicate, split 等追加する

}

namespace AsyncStream {

	async function connectQueue<T>(generator: AsyncGenerator<T, void, void>, queue: ConcurrentQueue<T>, stopRequest: Signal) {

		if (stopRequest.triggered) return;

		for await (const value of generator) {
			queue.add(value);
			if (stopRequest.triggered) {
				await generator.return(); // 親ストリームを停止する
				break;
			}
		}

	}

	async function *mergeGenerators<T>(...generators: AsyncGenerator<T, void, void>[]): AsyncGenerator<T, void, void> {

		const queue = new ConcurrentQueue<T>();
		const stopRequest = new Signal(); // (*1)
		const connections = generators.map(generator => connectQueue(generator, queue, stopRequest));

		const stopTask = Promise.all(connections).then(_ => null);

		try {

			//
			// 値が取得できたかもしくは停止されたかどうかを判別するため
			// 指定されたシグナルとの解決待ちが競合した状態を作ります
			//

			while (!stopRequest.triggered) {

				const item = await Promise.race([queue.get(stopRequest), stopTask]);

				//
				// ここではループ条件は例外にのみ対応しているため、(*1)
				// すべてのジェネレータが完了したことを検知 (item === null) した場合、
				// 別途ブレークする必要があります
				//

				if (item === null) break;
				
				yield item;

			}

		} catch (ex) {

			//
			// この実装では外部から停止させるためには、
			// ジェネレータ中で例外を吐くかもしくはストリームを閉じるしかないです
			// 即ち例外を捕捉したということはジェネレータはまだ動作している可能性があります
			// その他のジェネレータを停止させ解決を待機した後、その例外を再スローします
			//

			stopRequest.trigger();
			await Promise.allSettled(connections);
			throw ex;

		}

	}

	function createConcatenatedGenerator<T>(self: AsyncGenerator<T, void, void>, ...generators: AsyncGenerator<T, void, void>[]) {
		return mergeGenerators(self, ...generators);
	}

	async function *createMappedGenerator<T, U>(self: AsyncGenerator<T, void, void>, fn: (value: T) => (U | Promise<U>)) {
		for await (const value of self) yield await fn(value);
	}

	async function *createFilteredGenerator<T>(self: AsyncGenerator<T, void, void>, fn: (value: T) => (boolean | Promise<boolean>)) {
		for await (const value of self) {
			if (await fn(value)) yield value;
		}
	}

	/**
	 * ジェネレータからストリームを作成します。
	 * @param generator 元となるジェネレータ。
	 */
	export function from<T>(generator: AsyncGenerator<T, void, void>): AsyncStream<T>;

	/**
	 * Producer-Consumer コレクションからストリームを作成します。
	 * @param collection 元となる Producer-Consumer コレクション。
	 */
	export function from<T>(collection: ProducerConsumer<T>): AsyncStream<T>;

	/**
	 * イベントからストリームを作成します。
	 * @param event 元となるイベント。
	 */
	export function from<T>(event: AsyncEvent<T>): AsyncStream<T>;

	/**
	 * 名前付きイベントからストリームを作成します。
	 * @param event 元となるイベント。
	 * @param name イベント名。
	 */
	export function from<T>(event: NamedAsyncEvent<T>, name: string): AsyncStream<T>;

	export function from<T>(input: AsyncGenerator<T, void, void> | ProducerConsumer<T> | AsyncEvent<T> | NamedAsyncEvent<T>, eventName?: string): AsyncStream<T> {

		//
		// 元の型を判別します
		//

		let stream: any;
		if (input instanceof ProducerConsumer) stream = input.getMultiple();
		else if (input instanceof AsyncEvent) stream = input.waitMultiple();
		else if (input instanceof NamedAsyncEvent) stream = input.waitMultiple(eventName);
		else stream = input;

		stream.map = <U>(fn: (value: T) => (U | Promise<U>)) => from<U>(createMappedGenerator(stream, fn));
		stream.filter = (fn: (value: T) => (boolean | Promise<boolean>)) => from<T>(createFilteredGenerator(stream, fn));
		stream.mergeWith = (...generators: AsyncGenerator<T, void, void>[]) => from(createConcatenatedGenerator(stream, ...generators));
		return stream;

	}

	/**
	 * 複数のジェネレータを一つのストリームに合併し新たなストリームを返します。
	 * @param generators 合併するジェネレータ。
	 * @returns 合併された新たなストリーム。
	 */
	export function merge<T>(...generators: AsyncGenerator<T, void, void>[]) {
		return from(mergeGenerators(...generators));
	}

}

export default AsyncStream;
