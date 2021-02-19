import ProducerConsumer from "./ProducerConsumer";

/**
 * 非同期の LIFO コレクションを表します。
 */
export default class ConcurrentStack<Item> extends ProducerConsumer<Item> {

    /** @inheritdoc */
    protected produce(item: Item) {
        this.items.push(item);
    }

    /** @inheritdoc */
    protected consume() {
        return this.items.pop();
    }

}
