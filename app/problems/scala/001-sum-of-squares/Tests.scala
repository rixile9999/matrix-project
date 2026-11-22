@main def tests(): Unit =
  Judge.check("빈 리스트")(sumOfEvenSquares(Nil), 0)
  Judge.check("짝수와 홀수")(sumOfEvenSquares(List(1, 2, 3, 4)), 20)
  Judge.check("홀수만")(sumOfEvenSquares(List(1, 3, 5)), 0)
  Judge.check("음수")(sumOfEvenSquares(List(-2, -3)), 4)
