import { createStream } from '../src/ai/random'
import fs from 'node:fs'
const v1 = JSON.parse(fs.readFileSync('/tmp/v1stream.json', 'utf8'))
const s = createStream('apex-7')
const v2 = [s.next(), s.next(), s.next(), s.next(), s.next()]
console.log('v1:', v1.map((x) => x.toFixed(10)).join(' '))
console.log('v2:', v2.map((x) => x.toFixed(10)).join(' '))
const same = v1.every((x, i) => x === v2[i])
console.log(same ? 'PARITY CONFIRMED: identical streams' : 'MISMATCH - ports diverge')
console.log('draw count tracked:', s.count)
process.exit(same ? 0 : 1)
