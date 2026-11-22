import Expr.*

@main def tests(): Unit =
  Judge.check("숫자")(eval(Num(5)), 5)
  Judge.check("음수 숫자")(eval(Num(-3)), -3)
  Judge.check("덧셈")(eval(Add(Num(2), Num(3))), 5)
  Judge.check("곱셈")(eval(Mul(Num(4), Num(3))), 12)
  Judge.check("부호 반전")(eval(Neg(Num(7))), -7)
  Judge.check("이중 반전")(eval(Neg(Neg(Num(7)))), 7)
  Judge.check("중첩")(eval(Add(Mul(Num(2), Add(Num(3), Num(4))), Neg(Num(5)))), 9)
  Judge.check("0과 곱셈")(eval(Mul(Add(Num(2), Num(3)), Num(0))), 0)
