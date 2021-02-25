import Signal from "./Signal";
import AsyncStream from "./AsyncStream";

/**
 * Producer-Consumer 用途のコレクションを表します。
 */
export default abstract class ProducerConsumer<T> {

	private readonly resolvers: ((item: T) => void)[] = [];

	private balance() {

		//
		// レゾルバ配列もしくはが空になるまで、もしくは
		// 取り出せる項目が存在する限り解決し続けます
		//

		while (this.resolvers.length > 0) {
			const item = this.consume();
			if (item === undefined) break;
			const resolve: (item: T) => void = this.resolvers.shift();
			resolve(item);
		}

		return this.items.length > 0;

	}

	private async *createGetMultiple(stopRequest?: Signal): AsyncGenerator<T, void, void> {

		if (stopRequest === undefined) {

			while (true) yield await this.get();

		} else if (!stopRequest.triggered) {

			do {
				const item = await this.get(stopRequest);
				if (item !== null) yield item;
			} while (!stopRequest.triggered);

		}

	}

	/**
	 * すべてのデータ項目。
	 */
	protected readonly items: T[] = [];

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
	add(item: T) {
		this.produce(item);
		this.balance();
	}

	/**
	 * データ項目を受け取るまで待機します。
	 */
	get(): Promise<T>;

	/**
	 * データ項目を受け取るまで待機します。
	 * @param stopRequest 待機を停止するためのシグナル。
	 */
	get(stopRequest: Signal): Promise<T | null>;

	async get(stopRequest?: Signal): Promise<T | null> {

		if (stopRequest === undefined) {

			return this.balance()
				? this.consume()
				: await new Promise<T>(resolve => void this.resolvers.push(resolve));

		} else if (!stopRequest.triggered) {

			if (this.balance()) return this.consume();

			//
			// 値が取得できたかもしくは停止されたかどうかを判別するため
			// 指定されたシグナルとの解決待ちが競合した状態を作ります
			//

			const stopTask = stopRequest.wait().then(_ => null);
			const consumeTask = new Promise<T>(resolve => this.resolvers.push(resolve));
			return await Promise.race([consumeTask, stopTask]);

		}

		return null;

	}

	/**
	 * データ項目を受け取る非同期ストリームを返します。
	 * @param stopRequest ストリームを停止するためのシグナル。
	 */
	getMultiple(stopRequest?: Signal) {
		return AsyncStream.from(this.createGetMultiple(stopRequest));
	}

	/**
	 * データ項目を追加する処理を実装します。
	 * @param item 追加する項目。
	 */
	protected abstract produce(item: T): void;

	/**
	 * データ項目を取り出す処理を実装します。
	 */
	protected abstract consume(): T;

}
