@main def tests(): Unit =
  Judge.check("0보다 큰 첫 제곱수")(firstSquareOver(0), 1)
  Judge.check("1이면 4")(firstSquareOver(1), 4)
  Judge.check("15면 16")(firstSquareOver(15), 16)
  Judge.check("제곱수 자체는 제외")(firstSquareOver(16), 25)
  Judge.check("음수")(firstSquareOver(-5), 1)
  Judge.check("큰 값")(firstSquareOver(100), 121)
