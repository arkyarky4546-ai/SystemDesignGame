import type { ComponentDef, ComponentKind } from '../schema'
import { appServer } from './app-server'
import { database } from './database'
import { ingress } from './ingress'

/** Every component definition, by kind. Adding a kind to COMPONENT_KINDS fails typecheck until it has one. */
export const COMPONENT_DEFS: { readonly [K in ComponentKind]: ComponentDef & { readonly kind: K } } = {
  ingress,
  'app-server': appServer,
  database,
}
