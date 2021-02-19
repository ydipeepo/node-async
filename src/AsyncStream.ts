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
     * @param streams まとめる非同期ストリーム。
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

}

export default AsyncStream;
