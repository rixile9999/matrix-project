@main def tests(): Unit =
  Judge.check("빈 리스트")(firstTwo(Nil), "없음")
  Judge.check("원소 하나")(firstTwo(List(7)), "하나: 7")
  Judge.check("원소 둘")(firstTwo(List(7, 8)), "처음 둘: 7, 8")
  Judge.check("원소 여럿")(firstTwo(List(7, 8, 9, 10)), "처음 둘: 7, 8")
