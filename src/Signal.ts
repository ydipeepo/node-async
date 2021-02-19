/**
 * シグナルを表します。
 */
export default class Signal {

	private resolver?: () => void;
	private readonly promise = new Promise<void>(resolve => this.resolver = () => {
		this.resolver = undefined;
		resolve();
	});

	/**
	 * トリガされているかどうかを取得します。
	 */
	get triggered() {
		return this.resolver === undefined;
	}

	/**
	 * トリガします。
	 */
	trigger() {
		this.resolver?.();
	}

	/**
	 * トリガされるまで待機します。
	 */
	wait() {
		return this.promise;
	}

}
