import { EventEmitter } from "events";
import { range } from "@ydipeepo/array";
import ConcurrentQueue from "./ConcurrentQueue";
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

	/**
	 * このストリームを分配した新たなストリームを作成します。
	 * @param count 分配数。
	 * @returns 分配された新たなストリームの配列。
	 */
	distribute(count: number): AsyncStream<T>[];

	/**
	 * このストリームを分配した新たなストリームを作成します。
	 * @param count 分配数。
	 * @returns 分配された新たなストリームの配列。
	 */
	split(...fn: ((value: T) => (boolean | Promise<boolean>))[]): AsyncStream<T>[];

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

	async function *createMappedGenerator<T, U>(generator: AsyncGenerator<T, void, void>, fn: (value: T) => (U | Promise<U>)) {
		for await (const value of generator) yield await fn(value);
	}

	async function *filterGenerator<T>(generator: AsyncGenerator<T, void, void>, fn: (value: T) => (boolean | Promise<boolean>)) {
		for await (const value of generator) {
			if (await fn(value)) yield value;
		}
	}

	async function *mergeGenerators<T>(...generators: AsyncGenerator<T, void, void>[]): AsyncGenerator<T, void, void> {

		const queue = new ConcurrentQueue<T>();
		const stopRequest = new Signal(); // (*1)
		const connections = generators.map(generator => connectQueue(generator, queue, stopRequest));

		const stopTask = Promise.all(connections).then(() => null);

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

	function distributeGenerator<T>(generator: AsyncGenerator<T, void, void>, count: number): AsyncGenerator<T, void, void>[] {

		if (count === 0) throw new RangeError(`Insufficient duplicant count: ${count}`);

		const eventEmitter = new EventEmitter();
		const stopRequest = new Signal();

		async function createDuplicator() {

			try {
				for await (const value of generator) eventEmitter.emit("duplicate", value);
			} finally {
				stopRequest.trigger();
			}

		}

		async function *createDuplicantGenerator() {

			const queue = new ConcurrentQueue<T>();
			const eventHandler = (value: T) => queue.add(value);
			eventEmitter.on("duplicate", eventHandler);

			try {
				for await (const value of queue.getMultiple(stopRequest)) yield value;
			} finally {
				eventEmitter.off("duplicate", eventHandler);
				stopRequest.trigger();
				if (--count === 0) {
					await generator.return();
					await duplicator; //
				}
			}

		}

		const generators = range(count).map(() => createDuplicantGenerator());
		const duplicator = createDuplicator();
		return generators;

	}

	function splitGenerator<T>(generator: AsyncGenerator<T, void, void>, ...fn: ((value: T) => (boolean | Promise<boolean>))[]): AsyncGenerator<T, void, void>[] {

		return distributeGenerator(generator, fn.length).map((generator, i) => filterGenerator(generator, fn[i]));

	}

	function fromCollection<T>(collection: ProducerConsumer<T>, stopRequest?: Signal): AsyncGenerator<T, void, void> {

		return collection.getMultiple(stopRequest);

	}

	async function *fromEventEmitter<T>(eventEmitter: EventEmitter, eventName: string, stopRequest?: Signal): AsyncGenerator<T, void, void> {

		const queue = new ConcurrentQueue<T>();
		const eventHandler = (value: T) => queue.add(value);
		stopRequest ??= new Signal();
		eventEmitter.on(eventName, eventHandler);

		try {
			for await (const value of queue.getMultiple(stopRequest)) yield value;
		} finally {
			eventEmitter.off(eventName, eventHandler);
			stopRequest.trigger();
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
	 * @param stopRequest 待機を停止するためのシグナル。
	 */
	export function from<T>(collection: ProducerConsumer<T>, stopRequest?: Signal): AsyncStream<T>;

	/**
	 * 名前付きイベントからストリームを作成します。
	 * @param eventEmitter 元となるイベント。
	 * @param eventName イベント名。
	 * @param stopRequest 待機を停止するためのシグナル。
	 */
	export function from<T>(eventEmitter: EventEmitter, eventName: string, stopRequest?: Signal): AsyncStream<T>;

	export function from<T>(arg1: AsyncGenerator<T, void, void> | ProducerConsumer<T> | EventEmitter, arg2?: string | Signal, arg3?: Signal): AsyncStream<T> {

		let stream: any;

		//
		// 呼び出し引数を判別します
		//

		if (arg1 instanceof ProducerConsumer) {
			const collection = arg1 as ProducerConsumer<T>;
			const stopRequest = arg2 as (Signal | undefined);
			stream = fromCollection(collection, stopRequest);
		} else if (arg1 instanceof EventEmitter) {
			const eventEmitter = arg1 as EventEmitter;
			const eventName = arg2 as string;
			const stopRequest = arg3 as (Signal | undefined);
			stream = fromEventEmitter(eventEmitter, eventName, stopRequest);
		} else {
			const generator = arg1 as AsyncGenerator<T, void, void>;
			stream = generator;
		}

		stream.map = <U>(fn: (value: T) => (U | Promise<U>)) => from<U>(createMappedGenerator(stream, fn));
		stream.filter = (fn: (value: T) => (boolean | Promise<boolean>)) => from<T>(filterGenerator(stream, fn));
		stream.mergeWith = (...generators: AsyncGenerator<T, void, void>[]) => from(mergeGenerators(stream, ...generators));
		stream.distribute = (count: number) => distributeGenerator(stream, count).map(from);
		stream.split = (...fn: ((value: T) => (boolean | Promise<boolean>))[]) => splitGenerator(stream, ...fn).map(from);
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
