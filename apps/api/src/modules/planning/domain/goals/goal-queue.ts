import { type Goal, InvalidGoalError, type TradeIn } from './goal.js';

/**
 * Regras da fila para vender o bem de uma meta: a meta vendida existe, é de compra, vem ANTES na fila (o bem já
 * foi comprado quando a outra começa) e só uma meta vende cada bem. Bens que a pessoa já tem não dependem da fila.
 */

/** Recusa a meta se alguma venda dela não cabe na fila (`queue` já com a meta no lugar dela). */
export function assertTradeInsFit(queue: readonly Goal[], goal: Goal): void {
  const position = queue.findIndex((g) => g.id === goal.id);
  for (const { source } of goal.tradeIns) {
    if (source.kind !== 'goal') continue;
    const index = queue.findIndex((g) => g.id === source.goalId);
    const sold = queue[index];
    if (!sold) throw new InvalidGoalError('a meta do bem vendido não existe');
    if (sold.props.kind !== 'purchase') {
      throw new InvalidGoalError(`só dá para vender o bem de uma meta de compra ("${sold.name}" não é)`);
    }
    if (index > position) {
      throw new InvalidGoalError(`"${sold.name}" precisa vir antes de "${goal.name}" na fila para o bem ser vendido`);
    }
    const other = queue.find((g) => g.id !== goal.id && sellsGoal(g, source.goalId));
    if (other) throw new InvalidGoalError(`o bem de "${sold.name}" já é vendido por "${other.name}"`);
  }
}

/**
 * Tira as vendas que a fila deixou de sustentar (meta excluída, reordenada para depois ou que deixou de ser
 * compra). Se duas metas vendem o mesmo bem, fica a primeira da fila. Devolve só as metas alteradas.
 */
export function pruneTradeIns(queue: readonly Goal[]): Goal[] {
  const claimed = new Set<string>();
  const changed: Goal[] = [];
  queue.forEach((goal, position) => {
    const kept = goal.tradeIns.filter(({ source }) => {
      if (source.kind !== 'goal') return true;
      const index = queue.findIndex((g) => g.id === source.goalId);
      const ok =
        index >= 0 && index < position && queue[index]?.props.kind === 'purchase' && !claimed.has(source.goalId);
      if (ok) claimed.add(source.goalId);
      return ok;
    });
    if (kept.length !== goal.tradeIns.length) changed.push(goal.withTradeIns(kept));
  });
  return changed;
}

const sellsGoal = (goal: Goal, goalId: string) =>
  goal.tradeIns.some((t: TradeIn) => t.source.kind === 'goal' && t.source.goalId === goalId);
