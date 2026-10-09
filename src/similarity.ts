import { DHASH_BITS } from './constants'

export function hashDistance(a: string, b: string): number {
  if (!/^[0-9a-f]{16}$/i.test(a) || !/^[0-9a-f]{16}$/i.test(b)) return DHASH_BITS
  let value = BigInt(`0x${a}`) ^ BigInt(`0x${b}`)
  let distance = 0
  while (value) {
    value &= value - 1n
    distance++
  }
  return distance
}

interface Node { hash: string; indices: number[]; children: Map<number, Node> }

/** 精确汉明距离检索，不通过哈希前缀丢弃近邻。 */
export class HashIndex {
  private root?: Node

  add(hash: string, index: number) {
    if (!this.root) {
      this.root = { hash, indices: [index], children: new Map() }
      return
    }
    let node = this.root
    while (true) {
      const distance = hashDistance(hash, node.hash)
      if (!distance) { node.indices.push(index); return }
      const child = node.children.get(distance)
      if (child) node = child
      else {
        node.children.set(distance, { hash, indices: [index], children: new Map() })
        return
      }
    }
  }

  query(hash: string, radius: number): number[] {
    const matches: number[] = []
    const pending = this.root ? [this.root] : []
    while (pending.length) {
      const node = pending.pop()!
      const distance = hashDistance(hash, node.hash)
      if (distance <= radius) matches.push(...node.indices)
      for (const [edge, child] of node.children) {
        if (edge >= distance - radius && edge <= distance + radius) pending.push(child)
      }
    }
    return matches
  }
}

/** 每组成员都与代表图达到阈值；指标为成员与代表图的最低相似度。 */
export function groupSimilarImages<T extends { perceptualHash: string }>(items: T[], threshold: number): Array<{ items: T[]; similarity: number }> {
  const index = new HashIndex()
  const groups: Array<{ items: T[]; similarity: number }> = []
  const radius = Math.floor((1 - threshold) * DHASH_BITS + 1e-9)
  for (const item of items) {
    if (!/^[0-9a-f]{16}$/i.test(item.perceptualHash)) continue
    const candidates = index.query(item.perceptualHash, radius)
    let best = -1
    let distance = DHASH_BITS + 1
    for (const candidate of candidates) {
      const nextDistance = hashDistance(item.perceptualHash, groups[candidate].items[0].perceptualHash)
      if (nextDistance < distance) { best = candidate; distance = nextDistance }
    }
    if (best === -1) {
      index.add(item.perceptualHash, groups.length)
      groups.push({ items: [item], similarity: 1 })
    } else {
      groups[best].items.push(item)
      groups[best].similarity = Math.min(groups[best].similarity, 1 - distance / DHASH_BITS)
    }
  }
  return groups.filter((group) => group.items.length > 1)
}
