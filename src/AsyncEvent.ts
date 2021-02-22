import Signal from "./Signal";
import AsyncStream from "./AsyncStream";

/**
 * データを仲介するためのイベントを表します。
 */
export default class AsyncEvent<Arg = void> {

	private readonly resolvers: ((arg: Arg) => void)[] = [];

	private async *createWaitMultiple(stopRequest?: Signal): AsyncGenerator<Arg, void, void> {
		while (!stopRequest?.triggered) {
			const arg = await this.wait();
			yield arg;
		}
	}

	/**
	 * イベントを受け取るまで待機します。
	 */
	wait(): Promise<Arg> {
		return new Promise<Arg>(resolve => this.resolvers.push(resolve));
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
	 * @param arg イベントの引数。 
	 */
	emit(arg: Arg) {
		while (this.resolvers.length > 0) {
			const resolve = this.resolvers.shift();
			resolve(arg);
		}
	}

}
