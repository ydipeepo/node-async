import Signal from "./Signal";
import AsyncStream from "./AsyncStream";

/**
 * データを仲介するためのイベントを表します。
 */
export default class AsyncEvent<T = void> {

	private readonly resolvers: ((item: T) => void)[] = [];

	private async *createWaitMultiple(stopRequest?: Signal): AsyncGenerator<T, void, void> {

		if (stopRequest === undefined) {

			while (true) yield await this.wait();

		} else if (!stopRequest.triggered) {

			do {
				const item = await this.wait(stopRequest);
				if (item !== null) yield item;
			} while (!stopRequest.triggered);

		}

	}

	/**
	 * イベントを受け取るまで待機します。
	 */
	wait(): Promise<T>;

	/**
	 * イベントを受け取るまで待機します。
	 * @param stopRequest 待機を停止するためのシグナル。
	 */
	wait(stopRequest: Signal): Promise<T | null>;

	async wait(stopRequest?: Signal): Promise<T | null> {

		if (stopRequest === undefined) {

			return await new Promise<T>(resolve => this.resolvers.push(resolve));

		} else if (!stopRequest.triggered) {

			//
			// 値が取得できたかもしくは停止されたかどうかを判別するため
			// 指定されたシグナルとの解決待ちが競合した状態を作ります
			//

			const stopTask = stopRequest.wait().then(_ => null);
			const waitTask = new Promise<T>(resolve => this.resolvers.push(resolve));
			return await Promise.race([waitTask, stopTask]);

		}

		return null;

	}

	/**
	 * イベントを受け取る非同期ストリームを返します。
	 * @param stopRequest ストリームを停止するためのシグナル。
	 */
	waitMultiple(stopRequest?: Signal) {
		return AsyncStream.from(this.createWaitMultiple(stopRequest));
	}

	/**
	 * イベントを待機しているすべての受信者へ送信します。
	 * @param item イベントの引数。 
	 */
	emit(item: T) {
		while (this.resolvers.length > 0) {
			const resolve = this.resolvers.shift();
			resolve(item);
		}
	}

}
