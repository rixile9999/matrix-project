case class Parser[A](run: String => Option[(A, String)]):
  def map[B](f: A => B): Parser[B] =
    Parser(s => run(s).map((a, rest) => (f(a), rest)))

  def flatMap[B](f: A => Parser[B]): Parser[B] =
    Parser(s => run(s).flatMap((a, rest) => f(a).run(rest)))

  def withFilter(p: A => Boolean): Parser[A] =
    Parser(s => run(s).filter((a, _) => p(a)))

def pure[A](a: A): Parser[A] = Parser(s => Some((a, s)))

val item: Parser[Char] =
  Parser(s => s.headOption.map(c => (c, s.drop(1))))
