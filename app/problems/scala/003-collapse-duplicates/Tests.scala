@main def tests(): Unit =
  Judge.check("빈 리스트")(collapse(Nil), Nil)
  Judge.check("원소 하나")(collapse(List(5)), List(5))
  Judge.check("전부 같음")(collapse(List(2, 2, 2, 2)), List(2))
  Judge.check("중복 없음")(collapse(List(1, 2, 3)), List(1, 2, 3))
  Judge.check("떨어진 같은 값은 유지")(collapse(List(1, 2, 1)), List(1, 2, 1))
  Judge.check("섞인 경우")(collapse(List(1, 1, 2, 2, 2, 1, 3, 3)), List(1, 2, 1, 3))
  Judge.check("음수와 0")(collapse(List(0, 0, -1, -1, 0)), List(0, -1, 0))
  Judge.check("끝의 중복")(collapse(List(4, 5, 5)), List(4, 5))
