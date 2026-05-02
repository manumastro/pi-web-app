import {
  describe,
  it,
  test,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
  vi,
} from 'vitest';

type MockFactory = (<TArgs extends unknown[], TResult>(impl?: (...args: TArgs) => TResult) => ReturnType<typeof vi.fn>) & {
  module: typeof vi.mock;
};

const mock = ((impl?: (...args: unknown[]) => unknown) => vi.fn(impl)) as MockFactory;
mock.module = vi.mock;

export {
  describe,
  it,
  test,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
  mock,
  vi,
};
