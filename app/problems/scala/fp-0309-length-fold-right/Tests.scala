@main def tests(): Unit =
  Judge.check("빈 리스트")(length(Nil), 0)
  Judge.check("원소 하나")(length(List("x")), 1)
  Judge.check("여러 원소")(length(List(5, 5, 5, 5)), 4)
  Judge.check("원소 값과 무관")(length(List(0, -1, 99)), 3)
  Judge.check("중첩 리스트는 바깥 길이만")(length(List(List(1, 2, 3), Nil)), 2)
  Judge.check("1000개")(length(List.apply(scala.List.range(0, 1000)*)), 1000)
