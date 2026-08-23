import type { InputHTMLAttributes } from 'react'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & {
  value: string
  onValueChange: (value: string) => void
  allowDecimals?: boolean
}

const normalize = (input: string, allowDecimals: boolean) => {
  const cleaned = input.replace(/,/g, '').replace(allowDecimals ? /[^\d.]/g : /\D/g, '')
  if (!allowDecimals) return cleaned.replace(/^0+(?=\d)/, '')
  const [whole = '', ...fractionParts] = cleaned.split('.')
  const fraction = fractionParts.join('').slice(0, 2)
  const normalizedWhole = whole.replace(/^0+(?=\d)/, '')
  return fractionParts.length ? `${normalizedWhole || '0'}.${fraction}` : normalizedWhole
}

const display = (value: string) => {
  if (!value) return ''
  const [whole, fraction] = value.split('.')
  const grouped = (whole || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return fraction === undefined ? grouped : `${grouped}.${fraction}`
}

export default function FormattedNumberInput({ value, onValueChange, allowDecimals = true, ...props }: Props) {
  return <input {...props} type="text" inputMode={allowDecimals ? 'decimal' : 'numeric'} value={display(value)} onChange={(event) => onValueChange(normalize(event.target.value, allowDecimals))} />
}
