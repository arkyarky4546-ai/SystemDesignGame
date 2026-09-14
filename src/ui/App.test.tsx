import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BRANDING } from '../config/branding'
import { App } from './App'

describe('App shell', () => {
  it('renders the product name and nothing else', () => {
    const text = renderToStaticMarkup(<App />).replace(/<[^>]*>/g, '')
    expect(text).toBe(BRANDING.name)
  })
})
