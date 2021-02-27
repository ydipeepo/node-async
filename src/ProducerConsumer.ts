import Signal from "./Signal";

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
			if (item === null) break;
			const resolve: (item: T) => void = this.resolvers.shift();
			resolve(item);
		}

		return this.items.length > 0;

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
	 * @returns 取得した項目。
	 */
	get(): Promise<T>;

	/**
	 * データ項目を受け取るまで待機します。
	 * @param stopRequest 待機を停止するためのシグナル。
	 * @returns 取得できた場合は項目、停止が受理された場合は null。
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

			let stopTrailer: () => null = () => null;
			const stopTask = stopRequest.wait().then(() => stopTrailer());
			const waitTask = new Promise<T>(resolve => {
				stopTrailer = () => {
					const i = this.resolvers.indexOf(resolve);
					if (i !== -1) this.resolvers.splice(i, 1);
					return null;
				};
				this.resolvers.push(resolve);
			});
			return await Promise.race([waitTask, stopTask]);

		}

		return null;

	}

	/**
	 * データ項目を受け取る非同期ストリームを返します。
	 * @param stopRequest 待機を停止するためのシグナル。
	 */
	async *getMultiple(stopRequest?: Signal): AsyncGenerator<T, void, void> {

		//
		// stopRequest は yield を経由した return()/throw() による中断と、
		// get() 処理の中断のための停止可能な競合状態を作る目的とで兼用されます
		// これはジェネレータの終了処理を return()/throw() のみに集約できないためです
		//

		stopRequest ??= new Signal();

		try {

			while (!stopRequest.triggered) {
				const item = await this.get(stopRequest);
				if (item === null) break;
				yield item;
			}

		} finally {

			stopRequest.trigger();

		}

	}

	/**
	 * データ項目を追加する処理を実装します。
	 * @param item 追加する項目。
	 */
	protected abstract produce(item: T): void;

	/**
	 * データ項目を取り出す処理を実装します。
	 */
	protected abstract consume(): T | null;

}
