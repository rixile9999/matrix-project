@main def tests(): Unit =
  Judge.check("정수 덧셈")(zipWith(List(1, 2, 3), List(4, 5, 6))(_ + _), List(5, 7, 9))
  Judge.check("서로 다른 타입을 문자열로")(zipWith(List(1, 2), List("a", "b"))((n, s) => s * n), List("a", "bb"))
  Judge.check("튜플 만들기")(zipWith(List(1, 2, 3), List('x', 'y', 'z'))((_, _)), List((1, 'x'), (2, 'y'), (3, 'z')))
  Judge.check("앞이 더 짧음")(zipWith(List(1), List(1, 2, 3))(_ * _), List(1))
  Judge.check("뒤가 더 짧음")(zipWith(List(1, 2, 3), List(5, 6))(_ - _), List(-4, -4))
  Judge.check("빈 리스트")(zipWith(List.apply[Int](), List(1, 2))(_ + _), Nil)
  Judge.check("순서가 중요한 함수")(zipWith(List("a", "b"), List("1", "2"))(_ + _), List("a1", "b2"))
