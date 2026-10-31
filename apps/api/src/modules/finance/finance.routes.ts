import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { parsePage } from '@sahana/validation';
import { ApiError } from '../../errors';
import type { Scope } from '../../db';
import {
  addStatementLine,
  budgetReport,
  createAsset,
  createBankAccount,
  createBudget,
  createFund,
  createInvestment,
  fundLedger,
  listAssets,
  listFunds,
  matchStatement,
  memberLedger,
  reconciliation,
  statements,
} from './finance.service';

const text = z.string().trim().min(1).max(200);
const money = z.string().regex(/^-?\d+(\.\d{1,4})?$/);

function allow(req: Request, code: string): Scope {
  if (!req.actor) throw new ApiError(401, 'unauthorized', 'errors.unauthorized');
  if (!req.actor.permissions.includes(code)) throw new ApiError(403, 'forbidden', 'errors.forbidden');
  return { societyId: req.actor.societyId, userId: req.actor.userId };
}

async function send(res: Response, next: NextFunction, work: () => Promise<unknown>, status = 200) {
  try {
    const body = await work();
    res.status(status).json(body);
  } catch (error) {
    next(error);
  }
}

export function getStatements(req: Request, res: Response, next: NextFunction): void {
  const periodId = typeof req.query.periodId === 'string' ? req.query.periodId : undefined;
  void send(res, next, () => statements(allow(req, 'ledger.read'), periodId));
}

export function getMemberLedger(req: Request, res: Response, next: NextFunction): void {
  const page = parsePage(req.query);
  void send(res, next, () => memberLedger(allow(req, 'ledger.read'), String(req.params.id), page.page, page.pageSize));
}

export function getFunds(req: Request, res: Response, next: NextFunction): void {
  const page = parsePage(req.query);
  void send(res, next, () => listFunds(allow(req, 'ledger.read'), page.page, page.pageSize));
}

export function postFund(req: Request, res: Response, next: NextFunction): void {
  const body = z.object({ name: text }).parse(req.body);
  void send(res, next, () => createFund(allow(req, 'ledger.post'), body.name, req.traceId), 201);
}

export function getFundLedger(req: Request, res: Response, next: NextFunction): void {
  const page = parsePage(req.query);
  void send(res, next, () => fundLedger(allow(req, 'ledger.read'), String(req.params.id), page.page, page.pageSize));
}

export function postBank(req: Request, res: Response, next: NextFunction): void {
  const body = z.object({ name: text, accountId: z.string().uuid() }).parse(req.body);
  void send(res, next, () => createBankAccount(allow(req, 'ledger.post'), body, req.traceId), 201);
}

export function postStatement(req: Request, res: Response, next: NextFunction): void {
  const body = z
    .object({
      bankAccountId: z.string().uuid(),
      bookedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      amount: money,
      description: text,
    })
    .parse(req.body);
  void send(res, next, () => addStatementLine(allow(req, 'ledger.post'), body, req.traceId), 201);
}

export function postMatch(req: Request, res: Response, next: NextFunction): void {
  const body = z.object({ journalLineId: z.string().uuid() }).parse(req.body);
  void send(res, next, () => matchStatement(allow(req, 'ledger.post'), String(req.params.id), body.journalLineId, req.traceId));
}

export function getReconciliation(req: Request, res: Response, next: NextFunction): void {
  void send(res, next, () => reconciliation(allow(req, 'ledger.read'), String(req.params.id)));
}

export function postBudget(req: Request, res: Response, next: NextFunction): void {
  const body = z
    .object({
      name: text,
      accountId: z.string().uuid(),
      periodId: z.string().uuid(),
      amount: money,
    })
    .parse(req.body);
  void send(res, next, () => createBudget(allow(req, 'ledger.post'), body, req.traceId), 201);
}

export function getBudget(req: Request, res: Response, next: NextFunction): void {
  void send(res, next, () => budgetReport(allow(req, 'ledger.read'), String(req.params.id)));
}

export function getAssets(req: Request, res: Response, next: NextFunction): void {
  const page = parsePage(req.query);
  void send(res, next, () => listAssets(allow(req, 'ledger.read'), page.page, page.pageSize));
}

export function postAsset(req: Request, res: Response, next: NextFunction): void {
  const body = z
    .object({
      name: text,
      cost: money,
      acquiredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      usefulLifeYears: z.number().int().min(1).max(100).optional(),
    })
    .parse(req.body);
  void send(res, next, () => createAsset(allow(req, 'ledger.post'), body, req.traceId), 201);
}

export function postInvestment(req: Request, res: Response, next: NextFunction): void {
  const body = z
    .object({ name: text, cost: money, acquiredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
    .parse(req.body);
  void send(res, next, () => createInvestment(allow(req, 'ledger.post'), body, req.traceId), 201);
}
