import scala.annotation.tailrec

enum Token:
  case Number(value: Int)
  case Plus, Minus, Star, Slash, LParen, RParen

enum Expr:
  case Lit(n: Int)
  case Neg(e: Expr)
  case Add(l: Expr, r: Expr)
  case Sub(l: Expr, r: Expr)
  case Mul(l: Expr, r: Expr)
  case Div(l: Expr, r: Expr)

private val Symbols: Map[Char, Token] = Map(
  '+' -> Token.Plus, '-' -> Token.Minus, '*' -> Token.Star,
  '/' -> Token.Slash, '(' -> Token.LParen, ')' -> Token.RParen)

def tokenize(s: String): Either[String, List[Token]] =
  @tailrec
  def go(cs: List[Char], acc: List[Token]): Either[String, List[Token]] = cs match
    case Nil                         => Right(acc.reverse)
    case c :: rest if c.isWhitespace => go(rest, acc)
    case c :: _ if c.isDigit =>
      val (digits, rest) = cs.span(_.isDigit)
      go(rest, Token.Number(digits.mkString.toInt) :: acc)
    case c :: rest =>
      Symbols.get(c) match
        case Some(t) => go(rest, t :: acc)
        case None    => Left(s"알 수 없는 문자: '$c'")
  go(s.toList, Nil)

private type Parsed = Either[String, (Expr, List[Token])]

private def binary(operand: List[Token] => Parsed, ops: Map[Token, (Expr, Expr) => Expr])(ts: List[Token]): Parsed =
  def loop(left: Expr, rest: List[Token]): Parsed = rest match
    case op :: tail if ops.contains(op) =>
      operand(tail).flatMap((right, rest2) => loop(ops(op)(left, right), rest2))
    case _ => Right((left, rest))
  operand(ts).flatMap((first, rest) => loop(first, rest))

private def parseExpr(ts: List[Token]): Parsed =
  binary(parseTerm, Map(Token.Plus -> Expr.Add.apply, Token.Minus -> Expr.Sub.apply))(ts)

private def parseTerm(ts: List[Token]): Parsed =
  binary(parseFactor, Map(Token.Star -> Expr.Mul.apply, Token.Slash -> Expr.Div.apply))(ts)

private def parseFactor(ts: List[Token]): Parsed = ts match
  case Nil                     => Left("식이 갑자기 끝났습니다")
  case Token.Number(n) :: rest => Right((Expr.Lit(n), rest))
  case Token.Minus :: rest     => parseFactor(rest).map((e, rest2) => (Expr.Neg(e), rest2))
  case Token.LParen :: rest =>
    parseExpr(rest).flatMap {
      case (e, Token.RParen :: rest2) => Right((e, rest2))
      case _                          => Left("닫는 괄호가 없습니다")
    }
  case t :: _ => Left(s"예상하지 못한 토큰: $t")

def parse(tokens: List[Token]): Either[String, Expr] =
  parseExpr(tokens).flatMap {
    case (e, Nil)    => Right(e)
    case (_, t :: _) => Left(s"예상하지 못한 토큰: $t")
  }

def eval(e: Expr): Either[String, Int] = e match
  case Expr.Lit(n)    => Right(n)
  case Expr.Neg(x)    => eval(x).map(-_)
  case Expr.Add(l, r) => for a <- eval(l); b <- eval(r) yield a + b
  case Expr.Sub(l, r) => for a <- eval(l); b <- eval(r) yield a - b
  case Expr.Mul(l, r) => for a <- eval(l); b <- eval(r) yield a * b
  case Expr.Div(l, r) =>
    for
      a <- eval(l)
      b <- eval(r)
      q <- if b == 0 then Left("0으로 나눌 수 없습니다") else Right(a / b)
    yield q

def calc(s: String): Either[String, Int] =
  for
    tokens <- tokenize(s)
    expr   <- parse(tokens)
    value  <- eval(expr)
  yield value
