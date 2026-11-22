enum Expr:
  case Num(n: Int)
  case Add(l: Expr, r: Expr)
  case Mul(l: Expr, r: Expr)
  case Neg(e: Expr)

def eval(e: Expr): Int = e match
  case Expr.Num(n)    => n
  case Expr.Add(l, r) => eval(l) + eval(r)
  case Expr.Mul(l, r) => eval(l) * eval(r)
  case Expr.Neg(x)    => -eval(x)
