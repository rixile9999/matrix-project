@main def tests(): Unit =
  Judge.check("범위 안")(clamp(0, 10)(5), 5)
  Judge.check("아래로 벗어남")(clamp(0, 10)(-5), 0)
  Judge.check("위로 벗어남")(clamp(0, 10)(15), 10)
  Judge.check("경계값")(clamp(0, 10)(10), 10)
  Judge.check("부분 적용해 map")(List(-5, 5, 15).map(clamp(0, 10)), List(0, 5, 10))
  Judge.check("음수 범위")(clamp(-3, -1)(0), -1)
