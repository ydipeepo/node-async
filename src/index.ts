import Signal from "./Signal";
import AsyncEvent from "./AsyncEvent";
import NamedAsyncEvent from "./NamedAsyncEvent";
import ProducerConsumer from "./ProducerConsumer";
import ConcurrentQueue from "./ConcurrentQueue";
import ConcurrentStack from "./ConcurrentStack";
import AsyncStream from "./AsyncStream";

/**
 * タイムアウトするまで待機します。
 * @param timeout タイムアウト。
 */
function delay(timeout: number) {
	return new Promise<void>(resolve => void setTimeout(resolve, timeout));
}

export {
	Signal,
	AsyncEvent,
	NamedAsyncEvent,
	ProducerConsumer,
	ConcurrentQueue,
	ConcurrentStack,
	AsyncStream,
	delay,
}
