@main def tests(): Unit =
  def parse(s: String): Option[Int] = s.toIntOption match
    case scala.Some(n) => Some(n)
    case scala.None => None
  Judge.check("traverse: 모두 성공")(traverse(List("1", "2", "3"))(parse), Some(List(1, 2, 3)))
  Judge.check("traverse: 하나 실패")(traverse(List("1", "x", "3"))(parse), None)
  Judge.check("traverse: 빈 리스트")(traverse(List.empty[String])(parse), Some(Nil))
  Judge.check("traverse: 순서 유지")(traverse(List(3, 1, 2))(n => Some(n * 10)), Some(List(30, 10, 20)))
  Judge.check("sequence: 모두 Some")(sequence(List(Some(1), Some(2))), Some(List(1, 2)))
  Judge.check("sequence: None 포함")(sequence(List(Some(1), None)), None)
  Judge.check("sequence: 빈 리스트")(sequence(List.empty[Option[Int]]), Some(Nil))
  Judge.check("traverse: 변환 결과 타입이 다를 수 있음")(traverse(List(1, 2))(n => Some(s"#$n")), Some(List("#1", "#2")))
