// 胡牌类型
const WIN_TYPE = Object.freeze({
  ZIMO: 'zimo',
  DIANPAO: 'dianpao',
  GANGSHANGHUA: 'gangshanghua',
  GANGSHANGPAO: 'gangshangpao',
  QIANGGANGHU: 'qiangganghu',
  HAIDILAO: 'haidilao',
  HAIDIPAO: 'haidipao',
  TIANHU: 'tianhu',
  DIHU: 'dihu',
});

const ZIMO_TYPES = new Set([
  WIN_TYPE.ZIMO,
  WIN_TYPE.GANGSHANGHUA,
  WIN_TYPE.HAIDILAO,
  WIN_TYPE.TIANHU,
  WIN_TYPE.DIHU,
]);

const DIANPAO_TYPES = new Set([
  WIN_TYPE.DIANPAO,
  WIN_TYPE.GANGSHANGPAO,
  WIN_TYPE.QIANGGANGHU,
  WIN_TYPE.HAIDIPAO,
]);

const GANG_TYPE = Object.freeze({
  MING: 'ming',
  AN: 'an',
  BU: 'bu',
});

const SEAT = Object.freeze({
  EAST: 0,
  SOUTH: 1,
  WEST: 2,
  NORTH: 3,
});

const ERR_CODE = Object.freeze({
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_FULL: 'ROOM_FULL',
  ROOM_FINISHED: 'ROOM_FINISHED',
  NOT_IN_ROOM: 'NOT_IN_ROOM',
  INVALID_INPUT: 'INVALID_INPUT',
  FAN_EXCEEDS_MAX: 'FAN_EXCEEDS_MAX',
  GANG_COUNT_EXCEEDS: 'GANG_COUNT_EXCEEDS',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
});

const ROOM_STATUS = Object.freeze({
  ACTIVE: 'active',
  FINISHED: 'finished',
});

const AVATAR_COUNT = 8;
const ROOM_CODE_LENGTH = 6;

module.exports = {
  WIN_TYPE,
  ZIMO_TYPES,
  DIANPAO_TYPES,
  GANG_TYPE,
  SEAT,
  ERR_CODE,
  ROOM_STATUS,
  AVATAR_COUNT,
  ROOM_CODE_LENGTH,
};
