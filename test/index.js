const { expect } = require("chai");

describe("node-async", () => {

	const { range, xrange } = require("@ydipeepo/array");

	const {
		delay,
		Signal,
		ConcurrentQueue,
		ConcurrentStack,
		AsyncEvent,
		NamedAsyncEvent,
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

	it("producer-consumer queue: add, get", async () => {
		const queue = new ConcurrentQueue();
		const test = async value => expect(await queue.get()).is.equal(value);
		queue.add(0);
		queue.add(1);
		queue.add(2);
		expect(queue.count).is.equal(3);
		await test(0);
		await test(1);
		await test(2);
		expect(queue.count).is.equal(0);
	});

	it("producer-consumer queue: cancel", async () => {
		const queue = new ConcurrentQueue();
		const stopRequest = new Signal();
		const task = queue.get(stopRequest);
		stopRequest.trigger();
		expect(await task).is.equal(null);
	});

	it("producer-consumer stack: add, get", async () => {
		const stack = new ConcurrentStack();
		const test = async value => expect(await stack.get()).is.equal(value);
		stack.add(0);
		stack.add(1);
		stack.add(2);
		expect(stack.count).is.equal(3);
		await test(2);
		await test(1);
		await test(0);
		expect(stack.count).is.equal(0);
	});

	it("producer-consumer stack: cancel", async () => {
		const queue = new ConcurrentStack();
		const stopRequest = new Signal();
		const task = queue.get(stopRequest);
		stopRequest.trigger();
		expect(await task).is.equal(null);
	});

	it("async event: emit, wait", async () => {
		const event = new AsyncEvent();
		const stopRequest = new Signal();
		let count = 0;
		const test = async () => {
			for await (const _ of event.waitMultiple(stopRequest)) ++count;
		};
		const task = test();
		expect(count).is.equal(0);
		event.emit();
		await delay(5); // emit した直後は fulfilled に遷移してくれないことがある (?) ため短く待機しておきます
		expect(count).is.equal(1);
		event.emit();
		await delay(5); // 同上
		expect(count).is.equal(2);
		stopRequest.trigger();
		await task;
	});

	it("async event: cancel", async () => {
		const event = new AsyncEvent();
		const stopRequest = new Signal();
		const task = event.wait(stopRequest);
		stopRequest.trigger();
		expect(await task).is.equal(null);
	});

	it("named async event: emit, wait", async () => {
		const event = new NamedAsyncEvent();
		const stopRequest = new Signal();
		let count = 0;
		const test = async () => {
			for await (const _ of event.waitMultiple("test", stopRequest)) ++count;
		};
		const task = test();
		expect(count).is.equal(0);
		event.emit("test");
		await delay(5); // emit した直後は fulfilled に遷移してくれないことがある (?) ため短く待機しておきます
		expect(count).is.equal(1);
		event.emit("test");
		await delay(5); // 同上
		expect(count).is.equal(2);
		stopRequest.trigger();
		await task;
	});

	it("named async event: cancel", async () => {
		const event = new NamedAsyncEvent();
		const stopRequest = new Signal();
		const task = event.wait("test", stopRequest);
		stopRequest.trigger();
		expect(await task).is.equal(null);
	});

	async function *createMockGenerator(start, stop, step) {
		for (const value of xrange(start, stop, step)) {
			yield value;
		}
	}

	it("async stream: from, merge", async () => {
		const stream1 = AsyncStream.from(createMockGenerator(0, 3, 1));
		const stream2 = AsyncStream.from(createMockGenerator(3, 6, 1));
		const stream3 = AsyncStream.from(createMockGenerator(6, 9, 1));
		let badResult = false;
		const resultSet = new Set();
		for await (const value of AsyncStream.merge(stream1, stream2, stream3)) {
			if (resultSet.has(value)) badResult = true;
			else resultSet.add(value);
		}
		expect(badResult).is.equal(false);
		expect(resultSet.size).is.equal(9);
		expect(range(0, 9).every(v => resultSet.has(v))).is.equal(true);
	});

	it("async stream: map", async () => {
		const resultSet = new Set();
		for await (const value of AsyncStream.from(createMockGenerator(0, 10, 1)).map(v => v * 2)) {
			resultSet.add(value);
		}
		expect(resultSet.size).is.equal(10);
		expect(range(0, 20, 2).every(v => resultSet.has(v))).is.equal(true);
	});

	it("async stream: filter", async () => {
		const resultSet = new Set();
		for await (const value of AsyncStream.from(createMockGenerator(0, 10, 1)).filter(v => v % 2 === 0)) {
			resultSet.add(value);
		}
		expect(resultSet.size).is.equal(5);
		expect(range(0, 10, 2).every(v => resultSet.has(v))).is.equal(true);
	});

});
