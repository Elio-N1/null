export type Transaction = {
  id: number
  name: string
  category: string
  date: string
  amount: number
  kind: 'expense' | 'income'
}

export const seedTransactions: Transaction[] = [
  { id: 1, name: 'Carrefour Verdun', category: 'Food & dining', date: 'Aug 16', amount: -48.75, kind: 'expense' },
  { id: 2, name: 'Salary · Main job', category: 'Income', date: 'Aug 15', amount: 3900, kind: 'income' },
  { id: 3, name: 'Netflix', category: 'Entertainment', date: 'Aug 14', amount: -11.99, kind: 'expense' },
  { id: 4, name: 'Touch mobile', category: 'Utilities', date: 'Aug 13', amount: -26.5, kind: 'expense' },
  { id: 5, name: 'Classy Café', category: 'Food & dining', date: 'Aug 12', amount: -12.4, kind: 'expense' },
]

export const categoryBudgets = [
  { name: 'Housing', spent: 1950, limit: 2500 },
  { name: 'Food & dining', spent: 620, limit: 900 },
  { name: 'Transport', spent: 280, limit: 500 },
  { name: 'Shopping', spent: 410, limit: 800 },
  { name: 'Entertainment', spent: 120, limit: 400 },
]

export const chartPaths = {
  income: 'M0 137 C48 130 83 108 124 104 S181 92 220 94 S281 83 324 78 S380 73 422 68 S478 60 520 55 S578 44 626 48 S682 37 732 40 S784 33 840 30',
  expense: 'M0 142 C52 140 77 128 121 124 S184 114 225 120 S278 114 321 125 S377 103 420 110 S480 105 520 101 S579 92 625 87 S678 79 729 83 S784 66 840 64',
  net: 'M0 144 C45 145 80 137 123 141 S180 163 222 163 S276 157 320 177 S377 176 419 201 S479 193 522 181 S580 170 625 162 S679 155 731 150 S786 145 840 143',
}
