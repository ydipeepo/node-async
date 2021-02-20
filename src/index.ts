import AsyncEvent from "./AsyncEvent";
import AsyncStream from "./AsyncStream";
import ConcurrentQueue from "./ConcurrentQueue";
import ConcurrentStack from "./ConcurrentStack";
import ProducerConsumer from "./ProducerConsumer";
import Signal from "./Signal";

/**
 * タイムアウトするまで待機します。
 * @param timeout タイムアウト。
 */
function delay(timeout: number) {
	return new Promise<void>(resolve => void setTimeout(resolve, timeout));
}

export {
	delay,
	AsyncEvent,
	AsyncStream,
	ConcurrentQueue,
	ConcurrentStack,
	ProducerConsumer,
	Signal,
}
