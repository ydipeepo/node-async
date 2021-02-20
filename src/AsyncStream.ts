import ConcurrentQueue from "./ConcurrentQueue";
import Signal from "./Signal";

/**
 * 非同期ストリームを表します。
 * AsyncGenerator<T, void, void> のエイリアスです。
 */
type AsyncStream<T> = AsyncGenerator<T, void, void>;

namespace AsyncStream {

	async function connect<T>(stream: AsyncStream<T>, queue: ConcurrentQueue<T>, stopRequest: Signal) {
		for await (const value of stream) {
			queue.add(value);
			if (stopRequest.triggered) {
				await stream.return();
				break;
			}
		}
	}

	/**
	 * 複数の非同期ストリームをひとつにまとめます。
	 * @param streams 非同期ストリーム。
	 */
	export async function *merge<T>(...streams: AsyncStream<T>[]): AsyncStream<T> {
		const queue = new ConcurrentQueue<T>();
		const stopRequest = new Signal();
		const connections = streams.map(stream => connect(stream, queue, stopRequest));
		try {
			while (true) {
				const value = await queue.get();
				yield value;
			}
		} finally {
			stopRequest.trigger();
			await Promise.all(connections);
		}
	}

	/**
	 * 指定した非同期ストリームを別の型にマップします。
	 * @param stream 非同期ストリーム。
	 * @param pred 型変換処理を行うコールバック関数。
	 */
	export async function *map<T, U>(stream: AsyncStream<T>, fn: (value: T) => U): AsyncStream<U> {
		for await (const value of stream) yield fn(value);
	}

	/**
	 * 指定した非同期ストリームをフィルタします。
	 * @param stream 非同期ストリーム。
	 * @param pred フィルタ処理を行うコールバック関数。
	 */
	export async function *filter<T>(stream: AsyncStream<T>, fn: (value: T) => boolean): AsyncStream<T> {
		for await (const value of stream) {
			if (fn(value)) yield value;
		}
	}

}

export default AsyncStream;
