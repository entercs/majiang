// 胡牌类型
const WIN_TYPE = Object.freeze({
  ZIMO: 'zimo',                  // 自摸
  DIANPAO: 'dianpao',            // 点炮
  GANGSHANGHUA: 'gangshanghua',  // 杠上花（自摸）
  GANGSHANGPAO: 'gangshangpao',  // 杠上炮（点炮）
  QIANGGANGHU: 'qiangganghu',    // 抢杠胡（点炮）
  HAIDILAO: 'haidilao',          // 海底捞月（自摸）
  HAIDIPAO: 'haidipao',          // 海底炮（点炮）
  TIANHU: 'tianhu',              // 天胡（自摸）
  DIHU: 'dihu',                  // 地胡（自摸）
})

// 自摸型 winType（胡牌者赢 3 家）
const ZIMO_TYPES = new Set([
  WIN_TYPE.ZIMO,
  WIN_TYPE.GANGSHANGHUA,
  WIN_TYPE.HAIDILAO,
  WIN_TYPE.TIANHU,
  WIN_TYPE.DIHU,
])

// 点炮型 winType（胡牌者只赢点炮者）
const DIANPAO_TYPES = new Set([
  WIN_TYPE.DIANPAO,
  WIN_TYPE.GANGSHANGPAO,
  WIN_TYPE.QIANGGANGHU,
  WIN_TYPE.HAIDIPAO,
])

// 杠类型
const GANG_TYPE = Object.freeze({
  MING: 'ming',  // 明杠
  AN: 'an',      // 暗杠
  BU: 'bu',      // 补杠/加杠
})

// 座位
const SEAT = Object.freeze({
  EAST: 0,  // 庄家
  SOUTH: 1,
  WEST: 2,
  NORTH: 3,
})

// 错误码
const ERR_CODE = Object.freeze({
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_FULL: 'ROOM_FULL',
  ROOM_FINISHED: 'ROOM_FINISHED',
  ROOM_ALREADY_FINISHED: 'ROOM_ALREADY_FINISHED',
  NOT_IN_ROOM: 'NOT_IN_ROOM',
  FORBIDDEN: 'FORBIDDEN',
  PLAYER_NOT_FOUND: 'PLAYER_NOT_FOUND',
  INVALID_INPUT: 'INVALID_INPUT',
  FAN_EXCEEDS_MAX: 'FAN_EXCEEDS_MAX',
  GANG_COUNT_EXCEEDS: 'GANG_COUNT_EXCEEDS',
  RATE_LIMIT: 'RATE_LIMIT',
  TOO_MANY_ACTIVE_ROOMS: 'TOO_MANY_ACTIVE_ROOMS',
  TOO_MANY_JOINED_ROOMS: 'TOO_MANY_JOINED_ROOMS',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
})

// 房间状态
const ROOM_STATUS = Object.freeze({
  ACTIVE: 'active',
  FINISHED: 'finished',
})

// 头像数量
const AVATAR_COUNT = 8

// 房间号长度
const ROOM_CODE_LENGTH = 6

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
}
