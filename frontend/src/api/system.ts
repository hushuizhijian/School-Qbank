/** 系统 API */
import client from "./client"

/** 获取系统配置 */
export const getSystemConfig = async () => {
  const res = await client.get("/api/system/config")
  return res.data
}

/** 更新系统配置 */
export const updateSystemConfig = async (data: Record<string, unknown>) => {
  const res = await client.put("/api/system/config", data)
  return res.data
}

/* ========== 数据看板统计 API ========== */

/** 获取看板概览数据（题目总数、本月新增、异常题数、入库率等） */
export const getStatsOverview = async () => {
  const res = await client.get("/api/stats/overview")
  return res.data
}

/** 获取题目增长趋势（按月统计新增数和累计数）
 * @param months 查询最近几个月，默认6 */
export const getStatsTrend = async (months = 6) => {
  const res = await client.get("/api/stats/trend", { params: { months } })
  return res.data
}

/** 获取题目分布统计（按年级、题型、难度） */
export const getStatsDistribution = async () => {
  const res = await client.get("/api/stats/distribution")
  return res.data
}
