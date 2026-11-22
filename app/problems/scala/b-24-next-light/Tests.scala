import Light.*

@main def tests(): Unit =
  Judge.check("초록 다음")(next(Green), Yellow)
  Judge.check("노랑 다음")(next(Yellow), Red)
  Judge.check("빨강 다음")(next(Red), Green)
  Judge.check("세 번 적용하면 제자리")(next(next(next(Green))), Green)
  Judge.check("두 번 연속")(next(next(Red)), Yellow)
