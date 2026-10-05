export type LocationId = 'earth' | 'eden';
export type Action = { type: 'buy' | 'sell'; commodityId: string; quantity: number }
  | { type: 'travel'; destinationId: LocationId };
export interface Command { commandId: string; quoteId: string; expectedRevision: number }
export interface Quote { id: string; action: Action; expectedRevision: number; expiresAt: string; debitPence: number; creditPence: number }
export interface FinancialSummary { purchasesPence: number; salesPence: number; salesCostBasisPence: number; travelPence: number; netCashFlowPence: number; realizedProfitPence: number }
export interface Receipt { id: string; commandId: string; action: Action; locationBefore: LocationId; locationAfter: LocationId; debitPence: number; creditPence: number; cashAfterPence: number; revision: number; occurredAt: string; realizedProfitPence: number }
export interface State {
  companyId: string; revision: number; locationId: LocationId; cashPence: number;
  ship: { id: string; name: string; capacityUnits: number; cargo: { commodityId: string; quantity: number; costBasisPence: number }[] };
  crew: { id: string; name: string; role: 'captain' | 'engineer' | 'trader' }[];
  markets: { locationId: LocationId; revision: number; commodities: { id: string; name: string; stockUnits: number; buyUnitPence: number; sellUnitPence: number }[] }[];
  routes: { from: LocationId; to: LocationId; travelCostPence: number }[];
  finances: FinancialSummary;
  receipts: Receipt[];
}
export interface StateResponse { apiVersion: 1; state: State }
export interface QuoteResponse { apiVersion: 1; quote: Quote }
export interface CommandResponse extends StateResponse { commandId: string; receipt: Receipt; replayed: boolean }
export interface ErrorResponse { apiVersion: 1; error: { code: string; message: string; retryable: boolean } }
export interface AuthUser { id: string; displayName: string }
export interface AuthSessionResponse { apiVersion: 1; user: AuthUser | null; provider: 'google' }
export interface GoogleSignInResponse { apiVersion: 1; url: string }
export interface Api {
  authSession(): Promise<AuthSessionResponse>;
  signInGoogle(): Promise<GoogleSignInResponse>;
  signOut(): Promise<AuthSessionResponse>;
  session(): Promise<StateResponse>;
  state(): Promise<StateResponse>;
  quote(action: Action): Promise<QuoteResponse>;
  command(command: Command, options?: { expectedCompanyId: string }): Promise<CommandResponse>;
}
