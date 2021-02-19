import Signal from "./Signal";
import AsyncStream from "./AsyncStream";

/**
 * 名前付きデータを仲介するためのイベント型を表します。
 */
export default class AsyncEvent<Arg = void> {

	private readonly resolverMap: { [name: string]: ((arg: Arg) => void)[] } = {};

	/**
	 * 指定した名前のイベントを受け取るまで待機します。
	 * @param name イベントの名前。
	 */
	wait(name: string): Promise<Arg> {
		return new Promise<Arg>(resolve => {
			if (name in this.resolverMap) this.resolverMap[name].push(resolve);
			else this.resolverMap[name] = [resolve];
		});
	}

	/**
	 * 指定した名前のイベントを受け取る非同期ストリームを返します。
	 * @param name イベントの名前。
	 * @param stopRequest ストリームを停止するためのシグナル。
	 */
	async *waitMultiple(name: string, stopRequest?: Signal): AsyncStream<Arg> {
		while (!stopRequest?.triggered) {
			const arg = await this.wait(name);
			yield arg;
		}
	}

	/**
	 * 指定したイベントを待機しているすべての受信者へ送信します。
	 * @param name イベントの名前。
	 * @param item イベントの引数。 
	 */
	emit(name: string, arg: Arg) {
		if (name in this.resolverMap) {
			const resolvers = this.resolverMap[name];
			while (resolvers.length > 0) {
				const resolve = resolvers.shift();
				resolve(arg);
			}
		}
	}

}
