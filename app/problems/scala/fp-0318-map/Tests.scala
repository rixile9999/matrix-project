@main def tests(): Unit =
  Judge.check("정수에 1 더하기")(map(List(1, 2, 3))(_ + 1), List(2, 3, 4))
  Judge.check("타입 바꾸기")(map(List(1, 2, 3))(_.toString), List("1", "2", "3"))
  Judge.check("빈 리스트")(map(List.apply[Int]())(_ * 2), Nil)
  Judge.check("문자열 길이")(map(List("a", "bcd", ""))(_.length), List(1, 3, 0))
  Judge.check("항등 함수는 같은 리스트")(map(List(5, 6, 7))(x => x), List(5, 6, 7))
  Judge.check("합성은 두 번 map과 같음")(map(map(List(1, 2))(_ + 1))(_ * 10), map(List(1, 2))(x => (x + 1) * 10))
