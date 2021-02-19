import ProducerConsumer from "./ProducerConsumer";

/**
 * 非同期の FIFO コレクションを表します。
 */
export default class ConcurrentQueue<Item> extends ProducerConsumer<Item> {

	/** @inheritdoc */
	protected produce(item: Item) {
		this.items.push(item);
	}

	/** @inheritdoc */
	protected consume() {
		return this.items.shift();
	}

}
