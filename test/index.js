const { expect } = require("chai");
const { exception } = require("console");
const EventEmitter = require("events");
const { getAllJSDocTagsOfKind } = require("typescript");

describe("node-async", () => {

	const { range, xrange } = require("@ydipeepo/array");

	const {
		delay,
		Signal,
		ConcurrentQueue,
		ConcurrentStack,
		AsyncStream,
	} = require("../dist");

	it("signal", async () => {
		const signal = new Signal();
		expect(signal.triggered).is.equal(false);
		let done = false;
		const task = (async () => {
			await signal.wait();
			done = true;
		})();
		expect(done).is.equal(false);
		signal.trigger();
		await task;
		expect(signal.triggered).is.equal(true);
		expect(done).is.equal(true);
	});

	it("producer-consumer queue: add and get", async () => {
		const queue = new ConcurrentQueue();
		for (let i = 0; i < 10; ++i) queue.add(i);
		expect(queue.count).is.equal(10);
		for (let i = 0; i < 10; ++i) expect(await queue.get()).is.equal(i);
		expect(queue.count).is.equal(0);
	});

	it("producer-consumer queue: cancel", async () => {
		const queue = new ConcurrentQueue();
		const stopRequest = new Signal();
		const getTask = queue.get(stopRequest);
		stopRequest.trigger();
		await stopRequest.wait(); // 内部の waitTask にコンテキストをスイッチし継続させるため
		queue.add(10);
		expect(await getTask).is.equal(null);
		expect(queue.count).is.equal(1);
	});

	it("producer-consumer stack: add and get", async () => {
		const stack = new ConcurrentStack();
		for (let i = 0; i < 10; ++i) stack.add(i);
		expect(stack.count).is.equal(10);
		for (let i = 9; i >= 0; --i) expect(await stack.get()).is.equal(i);
		expect(stack.count).is.equal(0);
	});

	it("producer-consumer stack: cancel", async () => {
		const stack = new ConcurrentStack();
		const stopRequest = new Signal();
		const getTask = stack.get(stopRequest);
		stopRequest.trigger();
		await stopRequest.wait(); // 内部の waitTask にスイッチし継続させるため
		stack.add(10);
		expect(await getTask).is.equal(null);
		expect(stack.count).is.equal(1);
	});

	async function *createMockGenerator(a, b, c) {
		for (const value of range(a, b, c)) yield value;
	}

	it("async stream: from generator", async () => {
		const stream = AsyncStream.from(createMockGenerator(10));
		const values = [];
		for await (const value of stream) values.push(value);
		expect(values).to.deep.equal(range(10));
	});

	it("async stream: from event emitter", async () => {
		const eventEmitter = new EventEmitter();
		const stopRequest = new Signal();
		const stream = AsyncStream.from(eventEmitter, "name", stopRequest);
		const emitTask = (async () => {
			await delay(5);
			for (const value of range(10)) eventEmitter.emit("name", value);
			await delay(5);
			stopRequest.trigger();
		})();
		const values = [];
		for await (const value of stream) values.push(value);
		expect(values).to.deep.equal(range(10));
		await emitTask;
		expect(values).to.deep.equal(range(10));
	});

	it("async stream: from producer-consumer collection", async () => {
		const queue = new ConcurrentQueue();
		const stopRequest = new Signal();
		const stream = AsyncStream.from(queue, stopRequest);
		const addTask = (async () => {
			await delay(5);
			for (const value of range(10)) queue.add(value);
			await delay(5);
			stopRequest.trigger();
		})();
		const values = [];
		for await (const value of stream) values.push(value);
		expect(values).to.deep.equal(range(10));
		await addTask;
		expect(values).to.deep.equal(range(10));
	});

	it("async stream: cancel generator w/ return", async () => {
		let returned = false;
		const stream = AsyncStream.from((async function *() {
			try {
				for (const value of range(10)) yield value;
			} finally {
				returned = true;
			}
		})());
		expect(returned).is.equal(false);
		const values = [];
		for await (const value of stream) {
			values.push(value);
			if (value === 5) await stream.return();
		}
		expect(returned).is.equal(true);
		expect(values).to.deep.equal(values);
	});

	it("async stream: cancel event emitter w/ return", async () => {
		const eventEmitter = new EventEmitter();
		const stream = new AsyncStream.from(eventEmitter, "name");
		const emitTask = (async () => {
			await delay(5);
			for (const value of range(10)) eventEmitter.emit("name", value);
			await delay(5);
		})();
		const values = [];
		for await (const value of stream) {
			values.push(value);
			if (value === 5) await stream.return();
		}
		expect(values).to.deep.equal(values);
		await emitTask;
		expect(values).to.deep.equal(values);
	});

	it("async stream: cancel producer-consumer collection w/ return", async () => {
		const queue = new ConcurrentQueue();
		const stream = new AsyncStream.from(queue);
		const addTask = (async () => {
			await delay(5);
			for (const value of range(10)) queue.add(value);
			await delay(5);
		})();
		const values = [];
		for await (const value of stream) {
			values.push(value);
			if (value === 5) await stream.return();
		}
		expect(values).to.deep.equal(values);
		await addTask;
		expect(values).to.deep.equal(values);
	});

	it("async stream: cancel generator w/ throw", async () => {
		let thrown1 = false;
		let thrown2 = false;
		const stream = AsyncStream.from((async function *() {
			try {
				for (const value of range(10)) yield value;
			} catch (ex) {
				thrown1 = true;
				throw ex;
			}
		})());
		expect(thrown1).is.equal(false);
		expect(thrown2).is.equal(false);
		const values = [];
		try {
			for await (const value of stream) {
				values.push(value);
				if (value === 5) await stream.throw(new Error());
			}
		} catch {
			thrown2 = true;
		}
		expect(thrown1).is.equal(true);
		expect(thrown2).is.equal(true);
		expect(values).to.deep.equal(values);
	});

	it("async stream: cancel event emitter w/ throw", async () => {
		let thrown = false;
		const eventEmitter = new EventEmitter();
		const stream = new AsyncStream.from(eventEmitter, "name");
		const emitTask = (async () => {
			await delay(5);
			for (const value of range(10)) eventEmitter.emit("name", value);
			await delay(5);
		})();
		expect(thrown).is.equal(false);
		const values = [];
		try {
			for await (const value of stream) {
				values.push(value);
				if (value === 5) await stream.throw(new Error());
			}
		} catch {
			thrown = true;
		}
		expect(thrown).is.equal(true);
		expect(values).to.deep.equal(values);
		await emitTask;
		expect(values).to.deep.equal(values);
	});

	it("async stream: cancel producer-consumer collection w/ throw", async () => {
		let thrown = false;
		const queue = new ConcurrentQueue();
		const stream = new AsyncStream.from(queue);
		const addTask = (async () => {
			await delay(5);
			for (const value of range(10)) queue.add(value);
			await delay(5);
		})();
		expect(thrown).is.equal(false);
		const values = [];
		try {
			for await (const value of stream) {
				values.push(value);
				if (value === 5) await stream.throw(new Error());
			}
		} catch {
			thrown = true;
		}
		expect(thrown).is.equal(true);
		expect(values).to.deep.equal(values);
		await addTask;
		expect(values).to.deep.equal(values);
	});

	it("async stream: map", async () => {
		const stream = AsyncStream.from(createMockGenerator(10));
		const values = [];
		for await (const value of stream.map(value => value * 2)) values.push(value);
		expect(values).to.deep.equal(range(0, 20, 2));
	});

	it("async stream: filter", async () => {
		const stream = AsyncStream.from(createMockGenerator(10));
		const values = [];
		for await (const value of stream.filter(value => value % 2 === 0)) values.push(value);
		expect(values).to.deep.equal(range(0, 10, 2));
	});

	it("async stream: merge", async () => {
		const eventEmitter = new EventEmitter();
		const stopRequest = new Signal();
		const stream1 = AsyncStream.from(eventEmitter, "s1", stopRequest);
		const stream2 = AsyncStream.from(eventEmitter, "s2", stopRequest);
		const stream3 = AsyncStream.from(eventEmitter, "s3", stopRequest);
		const stream4 = AsyncStream.merge(stream1, stream2, stream3);
		const emitTask = (async () => {
			await delay(5);
			for (const value of range(10)) eventEmitter.emit("s1", value);
			for (const value of range(10, 20)) eventEmitter.emit("s2", value);
			for (const value of range(20, 30)) eventEmitter.emit("s3", value);
			await delay(5);
			stopRequest.trigger();
		})();
		const values = [];
		for await (const value of stream4) values.push(value);
		await emitTask;
		values.sort((a, b) => a - b);
		expect(values).to.deep.equal(range(30));
	});

	it("async stream: distribute", async () => {
		const eventEmitter = new EventEmitter();
		const stopRequest = new Signal();
		const stream1 = AsyncStream.from(eventEmitter, "name", stopRequest);
		const streams = stream1.distribute(5);
		const emitTask = (async () => {
			await delay(5);
			for (const value of range(10)) eventEmitter.emit("name", value);
			await delay(5);
			stopRequest.trigger();
		})();
		const valueMap = {};
		for await (const value of AsyncStream.merge(...streams).map(value => value.toString())) {
			if (value in valueMap) ++valueMap[value];
			else valueMap[value] = 1;
		}
		await emitTask;
		for (const value of range(10).map(value => value.toString())) expect(valueMap[value]).is.equal(5);
	});

	it("async stream: split", async () => {
		const eventEmitter = new EventEmitter();
		const stopRequest = new Signal();
		const stream1 = AsyncStream.from(eventEmitter, "name", stopRequest);
		const streams = stream1.split(
			value => value % 5 === 0,
			value => value % 5 === 1,
			value => value % 5 === 2,
			value => value % 5 === 3,
			value => value % 5 === 4,
		);
		const emitTask = (async () => {
			await delay(5);
			for (const value of range(10)) eventEmitter.emit("name", value);
			await delay(5);
			stopRequest.trigger();
		})();
		const valueMap = {};
		for await (const value of AsyncStream.merge(...streams).map(value => value.toString())) {
			if (value in valueMap) ++valueMap[value];
			else valueMap[value] = 1;
		}
		await emitTask;
		for (const value of range(10).map(value => value.toString())) expect(valueMap[value]).is.equal(1);
	});

});
