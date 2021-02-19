import Signal from "./Signal";
import AsyncStream from "./AsyncStream";

/**
 * Producer-Consumer 用途のコレクションを表します。
 */
export default abstract class ProducerConsumer<Item> {

	private readonly resolvers: ((item: Item) => void)[] = [];

    private balance() {

		//
		// レゾルバ配列もしくはが空になるまで、もしくは
		// デキューできる項目が存在する限り解決し続ける
		//

		while (this.resolvers.length > 0) {
			const item = this.consume();
			if (item === undefined) break;
			const resolve = this.resolvers.shift() as (item: Item) => void;
			resolve(item);
		}

		return this.items.length > 0;

	}

    /**
     * すべてのデータ項目。
     */
	protected readonly items: Item[] = [];

	/**
	 * データ項目の個数。
	 */
	get count() {
		return this.items.length;
	}

    /**
	 * 指定したデータ項目を追加します。
	 * @param item 追加する項目。
	 */
	add(item: Item) {
        this.produce(item);
		this.balance();
	}

	/**
	 * データ項目を受け取るまで待機します。
	 */
	get(): Promise<Item> {
		return new Promise<Item>(resolve => {
			if (this.balance()) resolve(this.consume());
			else this.resolvers.push(resolve);
		});
	}

	/**
	 * データ項目を受け取る非同期ストリームを返します。
	 * @param stopRequest ストリームを停止するためのシグナル。
	 */
	async *getMultiple(stopRequest?: Signal): AsyncStream<Item> {
		while (!stopRequest?.triggered) {
			const item = await this.get();
			yield item;
		}
	}

    /**
     * データ項目を追加する処理を実装します。
     * @param item 追加する項目。
     */
    protected abstract produce(item: Item): void;

    /**
     * データ項目を取り出す処理を実装します。
     */
    protected abstract consume(): Item;

}
