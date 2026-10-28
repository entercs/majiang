// 内存数据库模拟分页、原子提交和回滚。不能替代真实云端冲突重试/权限验收。
function makeCloud(initial = {}, openid = 'wx-a') {
  let tables = structuredClone(initial);
  let tail = Promise.resolve();
  let nextId = 0;
  const calls = [];
  const command = {
    gt: value => ({ op: 'gt', value }), lte: value => ({ op: 'lte', value }),
    exists: value => ({ op: 'exists', value }), and: value => ({ op: 'and', value }),
    in: value => ({ op: 'in', value }), or: value => ({ op: 'or', value }),
    remove: () => ({ op: 'remove' }),
  };
  function matches(row, query) {
    if (query.op === 'and') return query.value.every(q => matches(row, q));
    if (query.op === 'or') return query.value.some(q => matches(row, q));
    return Object.entries(query).every(([key, expected]) => {
      if (expected && expected.op) {
        if (expected.op === 'exists') return Object.prototype.hasOwnProperty.call(row, key) === expected.value;
        if (expected.op === 'gt') return row[key] > expected.value;
        if (expected.op === 'lte') return row[key] <= expected.value;
        if (expected.op === 'in') return expected.value.includes(row[key]);
      }
      return row[key] === expected;
    });
  }
  function database(readTables, throwOnNotFound = true) {
    function collection(name) {
      function query(filter = {}, sorting = [], offset = 0, size = 20) {
        const api = {
          where: q => query(q, sorting, offset, size),
          orderBy: (key, dir) => query(filter, [...sorting, [key, dir]], offset, size),
          skip: n => query(filter, sorting, n, size),
          limit: n => query(filter, sorting, offset, n),
          field: () => api,
          async get() {
            calls.push({ collection: name, method: 'query', size, filter });
            let rows = (readTables()[name] || []).filter(r => matches(r, filter));
            rows = [...rows].sort((a, b) => {
              for (const [key, dir] of sorting) {
                const diff = a[key] === b[key] ? 0 : a[key] > b[key] ? 1 : -1;
                if (diff) return dir === 'desc' ? -diff : diff;
              }
              return 0;
            });
            return { data: structuredClone(rows.slice(offset, offset + size)) };
          },
          async count() { return { total: (readTables()[name] || []).filter(r => matches(r, filter)).length }; },
          doc(id) {
            return {
              async get() {
                calls.push({ collection: name, method: 'get', id });
                const doc = (readTables()[name] || []).find(r => r._id === id);
                if (!doc && throwOnNotFound) throw new Error('document.get:fail document with _id ' + id + ' does not exist');
                return { data: structuredClone(doc || null) };
              },
              async set({ data }) {
                calls.push({ collection: name, method: 'set', id });
                const table = readTables()[name] ||= [];
                const index = table.findIndex(r => r._id === id);
                const doc = { ...structuredClone(data), _id: id };
                if (index < 0) table.push(doc); else table[index] = doc;
              },
              async update({ data }) {
                calls.push({ collection: name, method: 'update', id });
                const doc = (readTables()[name] || []).find(r => r._id === id);
                if (!doc) throw new Error('missing document');
                for (const [key, value] of Object.entries(data)) {
                  if (value && value.op === 'remove') delete doc[key]; else doc[key] = structuredClone(value);
                }
              },
            };
          },
          async add({ data }) {
            const id = 'id-' + ++nextId;
            await api.doc(id).set({ data });
            return { _id: id };
          },
        };
        return api;
      }
      return query();
    }
    return { collection, command };
  }
  const instances = new Map();
  function getDatabase(options = {}) {
    const throwOnNotFound = options.throwOnNotFound !== false;
    if (instances.has(throwOnNotFound)) return instances.get(throwOnNotFound);
    const db = database(() => tables, throwOnNotFound);
    db.runTransaction = fn => {
      const operation = tail.then(async () => {
        const draft = structuredClone(tables);
        const result = await fn(database(() => draft, throwOnNotFound));
        tables = draft;
        return result;
      });
      tail = operation.catch(() => {});
      return operation;
    };
    instances.set(throwOnNotFound, db);
    return db;
  }
  return {
    init: () => {}, DYNAMIC_CURRENT_ENV: 'test', getWXContext: () => ({ OPENID: openid }),
    database: getDatabase, deleteFile: jest.fn(async () => ({})),
    openapi: { wxacode: { get: jest.fn(async () => ({ buffer: Buffer.from('qr') })) } },
    uploadFile: jest.fn(async () => ({ fileID: 'cloud://qr' })),
    calls,
    rows: name => structuredClone(tables[name] || []),
    setOpenid: value => { openid = value; },
  };
}
module.exports = { makeCloud };
