import Signal from "./Signal";
import AsyncStream from "./AsyncStream";

/**
 * 名前付きでデータを仲介するためのイベントを表します。
 */
export default class NamedAsyncEvent<T = void> {

	private readonly resolverMap: { [name: string]: ((item: T) => void)[] } = {};

	private async *createWaitMultiple(name: string, stopRequest?: Signal): AsyncGenerator<T, void, void> {

		if (stopRequest === undefined) {

			while (true) yield await this.wait(name);

		} else if (!stopRequest.triggered) {

			do {
				const item = await this.wait(name, stopRequest);
				if (item !== null) yield item;
			} while (!stopRequest.triggered);

		}

	}

	/**
	 * 指定した名前のイベントを受け取るまで待機します。
	 * @param name イベントの名前。
	 */
	wait(name: string): Promise<T>;

	/**
	 * 指定した名前のイベントを受け取るまで待機します。
	 * @param name イベントの名前。
	 * @param stopRequest 待機を停止するためのシグナル。
	 */
	wait(name: string, stopRequest: Signal): Promise<T | null>;

	async wait(name: string, stopRequest?: Signal): Promise<T | null> {

		if (stopRequest === undefined) {

			return await new Promise<T>(resolve => {
				if (name in this.resolverMap) this.resolverMap[name].push(resolve);
				else this.resolverMap[name] = [resolve];
			});

		} else if (!stopRequest.triggered) {

			//
			// 値が取得できたかもしくは停止されたかどうかを判別するため
			// 指定されたシグナルとの解決待ちが競合した状態を作ります
			//

			const stopTask = stopRequest.wait().then(_ => null);
			const waitTask = new Promise<T>(resolve => {
				if (name in this.resolverMap) this.resolverMap[name].push(resolve);
				else this.resolverMap[name] = [resolve];
			});
			return await Promise.race([waitTask, stopTask]);

		}

		return null;

	}


	/**
	 * 指定した名前のイベントを受け取る非同期ストリームを返します。
	 * @param name イベントの名前。
	 * @param stopRequest ストリームを停止するためのシグナル。
	 */
	waitMultiple(name: string, stopRequest?: Signal) {
		return AsyncStream.from(this.createWaitMultiple(name, stopRequest));
	}

	/**
	 * 指定したイベントを待機しているすべての受信者へ送信します。
	 * @param name イベントの名前。
	 * @param item イベントの引数。 
	 */
	emit(name: string, item: T) {
		if (name in this.resolverMap) {
			const resolvers = this.resolverMap[name];
			while (resolvers.length > 0) {
				const resolve = resolvers.shift();
				resolve(item);
			}
		}
	}

}
