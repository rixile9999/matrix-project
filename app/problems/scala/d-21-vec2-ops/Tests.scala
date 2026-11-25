@main def tests(): Unit =
  var p = Vec2(1, 2)
  p += Vec2(3, 4)
  Judge.check("+= 가 + 대입으로 풀린다")(p, Vec2(4, 6))
  Judge.check("단항 -")(-p, Vec2(-4, -6))
  Judge.check("이항 -")(p - Vec2(1, 1), Vec2(3, 5))
  p -= Vec2(4, 6)
  Judge.check("-= 도 마찬가지")(p, Vec2(0, 0))
  val s = Scores(3)
  s(1) = 2
  s(1) += 5
  Judge.check("s(i) += n")(s(1), 7)
  Judge.check("다른 칸은 0")((s(0), s(2)), (0, 0))
  Judge.check("범위 밖은 예외")(try { s(3); "no" } catch case _: IndexOutOfBoundsException => "oob", "oob")
