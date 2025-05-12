// backend/middlewares/requirePlan.js
const order = { basic: 0, standard: 1, premium: 2 };

/**
 * Проверяет, что у пользователя тариф &ge; minPlan.
 *   requirePlan('standard')  &rarr; пропустит standard и premium
 */
export function requirePlan (minPlan = 'basic') {
  return (req, res, next) => {
    // берём актуальный план из req.user (см. verifyToken ниже)
    const plan = (req.user?.plan || 'basic').toLowerCase();

    if (order[plan] === undefined) {
      return res.status(400).json({ message:`Неизвестный тариф "${plan}"` });
    }
    if (order[plan] < order[minPlan]) {
      return res.status(403).json({ message:`Доступно только на тарифе "${minPlan}" или выше` });
    }
    next();
  };
}
