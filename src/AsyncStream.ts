import AsyncEvent from "./AsyncEvent";
import ConcurrentQueue from "./ConcurrentQueue";
import ProducerConsumer from "./ProducerConsumer";
import Signal from "./Signal";

/**
 * 非同期ストリームを表します。
 */
interface AsyncStream<T> extends AsyncGenerator<T, void, void> {

	/**
	 * このストリームを別の型にマップしたストリームを作成します。
	 * @param fn 型変換処理を行うコールバック関数。
	 */
	map<U>(fn: (value: T) => (U | Promise<U>)): AsyncStream<U>;

	/**
	 * このストリームをフィルタしたストリームを作成します。
	 * @param fn フィルタ処理を行うコールバック関数。
	 */
	filter(fn: (value: T) => (boolean | Promise<boolean>)): AsyncStream<T>;
	
	/**
	 * このストリームにジェネレータを結合します。
	 * @param generators 結合するジェネレータ。
	 */
	concat(...generators: AsyncGenerator<T, void, void>[]): AsyncStream<T>;

}

namespace AsyncStream {

	async function connect<T>(generator: AsyncGenerator<T, void, void>, queue: ConcurrentQueue<T>, stopRequest: Signal) {
		for await (const value of generator) {
			queue.add(value);
			if (stopRequest.triggered) {
				await generator.return();
				break;
			}
		}
	}

	async function *mergeGenerators<T>(...generators: AsyncGenerator<T, void, void>[]): AsyncGenerator<T, void, void> {
		const queue = new ConcurrentQueue<T>();
		const stopRequest = new Signal();
		const connections = [...generators.map(generator => connect(generator, queue, stopRequest))];
		try {
			while (true) yield await queue.get();
		} finally {
			stopRequest.trigger();
			await Promise.all(connections);
		}
	}

	function createConcat<T>(self: AsyncGenerator<T, void, void>, ...generators: AsyncGenerator<T, void, void>[]) {
		return mergeGenerators(self, ...generators);
	}

	async function *createMap<T, U>(self: AsyncGenerator<T, void, void>, fn: (value: T) => (U | Promise<U>)) {
		for await (const value of self) yield await fn(value);
	}

	async function *createFilter<T>(self: AsyncGenerator<T, void, void>, fn: (value: T) => (boolean | Promise<boolean>)) {
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
	 * @param name イベント名。
	 */
	export function from<T>(event: AsyncEvent<T>, name: string): AsyncStream<T>;

	export function from<T>(input: AsyncGenerator<T, void, void> | ProducerConsumer<T> | AsyncEvent<T>, eventName?: string): AsyncStream<T> {
		let stream: any;
		if (input instanceof ProducerConsumer) stream = input.getMultiple();
		else if (input instanceof AsyncEvent) stream = input.waitMultiple(eventName);
		else stream = input;
		stream.map = <U>(fn: (value: T) => (U | Promise<U>)) => from<U>(createMap(stream, fn));
		stream.filter = (fn: (value: T) => (boolean | Promise<boolean>)) => from<T>(createFilter(stream, fn));
		stream.concat = (...generators: AsyncGenerator<T, void, void>[]) => from(createConcat(stream, ...generators));
		return stream;
	}

	/**
	 * 複数のジェネレータをストリームに結合します。
	 * @param generators 結合するジェネレータ。
	 */
	export function merge<T>(...generators: AsyncGenerator<T, void, void>[]) {
		return from(mergeGenerators(...generators));
	}

}

export default AsyncStream;
