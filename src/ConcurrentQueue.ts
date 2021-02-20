import ProducerConsumer from "./ProducerConsumer";

/**
 * 非同期の FIFO コレクションを表します。
 */
class ConcurrentQueue<T> extends ProducerConsumer<T> {

	/** @inheritdoc */
	protected produce(item: T) {
		this.items.push(item);
	}

	/** @inheritdoc */
	protected consume() {
		return this.items.shift();
	}

}

namespace ConcurrentQueue {

	/**
	 * データ配列からキューを作成します。
	 * @param items データ配列。
	 */
	export function from<T>(...items: T[]) {
		const queue = new ConcurrentQueue<T>();
		for (const item of items) queue.add(item);
		return queue;
	}

}

export default ConcurrentQueue;
