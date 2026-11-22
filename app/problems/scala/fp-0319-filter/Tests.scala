@main def tests(): Unit =
  Judge.check("filter: 짝수만")(filter(List(1, 2, 3, 4))(_ % 2 == 0), List(2, 4))
  Judge.check("filter: 모두 통과")(filter(List(1, 2, 3))(_ => true), List(1, 2, 3))
  Judge.check("filter: 모두 탈락")(filter(List(1, 2, 3))(_ => false), Nil)
  Judge.check("filter: 문자열, 순서 유지")(filter(List("bb", "a", "cc", "d"))(_.length == 1), List("a", "d"))
  Judge.check("filter: 빈 리스트")(filter(List.apply[Int]())(_ > 0), Nil)
  Judge.check("removeOdds")(removeOdds(List(1, 2, 3, 4, 5, 6)), List(2, 4, 6))
  Judge.check("removeOdds: 음수 홀수")(removeOdds(List(-3, -2, -1, 0)), List(-2, 0))
  Judge.check("removeOdds: 홀수만 있는 경우")(removeOdds(List(1, 3, 5)), Nil)
