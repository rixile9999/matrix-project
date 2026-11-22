@main def tests(): Unit =
  def parse(s: String): Either[String, Int] = s.toIntOption match
    case scala.Some(n) => Right(n)
    case scala.None => Left(s"숫자가 아님: $s")
  Judge.check("traverse: 모두 성공")(traverse(List("1", "2", "3"))(parse), Right(List(1, 2, 3)))
  Judge.check("traverse: 하나 실패")(traverse(List("1", "x", "3"))(parse), Left("숫자가 아님: x"))
  Judge.check("traverse: 처음 만난 오류만")(traverse(List("a", "b"))(parse), Left("숫자가 아님: a"))
  Judge.check("traverse: 빈 리스트")(traverse(List.empty[String])(parse), Right(Nil))
  Judge.check("sequence: 모두 Right")(sequence(List(Right(1), Right(2))), Right(List(1, 2)))
  Judge.check("sequence: 오류 이유가 유지됨")(sequence(List(Right(1), Left("실패"), Right(3))), Left("실패"))
  Judge.check("sequence: 빈 리스트")(sequence(List.empty[Either[String, Int]]), Right(Nil))
  Judge.check("traverse: 순서 유지")(traverse(List(3, 1, 2))(n => Right(n * 10): Either[String, Int]), Right(List(30, 10, 20)))
