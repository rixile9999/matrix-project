@main def tests(): Unit =
  Judge.check("각 원소를 두 번")(flatMap(List(1, 2, 3))(i => List(i, i)), List(1, 1, 2, 2, 3, 3))
  Judge.check("빈 리스트")(flatMap(List.apply[Int]())(i => List(i)), Nil)
  Judge.check("빈 리스트를 돌려주는 원소는 사라짐")(flatMap(List(1, 2, 3, 4))(i => if i % 2 == 0 then List(i) else Nil), List(2, 4))
  Judge.check("타입 변경")(flatMap(List("ab", "c"))(s => List(s, s.toUpperCase)), List("ab", "AB", "c", "C"))
  Judge.check("길이가 다른 결과, 순서 유지")(flatMap(List(1, 2, 3))(i => List(i, i, i)), List(1, 1, 1, 2, 2, 2, 3, 3, 3))
  Judge.check("항상 빈 리스트")(flatMap(List(1, 2))(_ => List.apply[String]()), Nil)
