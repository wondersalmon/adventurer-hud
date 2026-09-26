// Keep local mutations ordered; a failed task must not block later requests.
export function createTaskQueue() {
  let pending = Promise.resolve();
  return callback => {
    const result = pending.then(callback);
    pending = result.catch(() => {});
    return result;
  };
}
