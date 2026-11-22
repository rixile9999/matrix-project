import Token.*
import Expr.*

@main def tests(): Unit =
  // 1단계: tokenize
  Judge.check("1단계 tokenize › 숫자와 연산자")(
    tokenize("12+3*(4-1)"),
    Right(List(Number(12), Plus, Number(3), Star, LParen, Number(4), Minus, Number(1), RParen)))
  Judge.check("1단계 tokenize › 공백은 건너뛰고 숫자는 공백으로 나뉜다")(
    (tokenize("  7 /  2 10 "), tokenize(" ")),
    (Right(List(Number(7), Slash, Number(2), Number(10))), Right(Nil)))
  Judge.check("1단계 tokenize › 알 수 없는 문자는 처음 만난 것을 보고")(
    (tokenize("2 $ 3 #"), tokenize("1.5")),
    (Left("알 수 없는 문자: '$'"), Left("알 수 없는 문자: '.'")))

  // 2단계: parse
  Judge.check("2단계 parse › 곱셈이 덧셈보다 먼저")(
    parse(List(Number(1), Plus, Number(2), Star, Number(3))),
    Right(Add(Lit(1), Mul(Lit(2), Lit(3)))))
  Judge.check("2단계 parse › 같은 우선순위는 왼쪽부터")(
    parse(List(Number(8), Minus, Number(3), Minus, Number(2), Slash, Number(2), Star, Number(5))),
    Right(Sub(Sub(Lit(8), Lit(3)), Mul(Div(Lit(2), Lit(2)), Lit(5)))))
  Judge.check("2단계 parse › 괄호가 우선순위를 바꾼다")(
    parse(List(LParen, Number(1), Plus, Number(2), RParen, Star, Number(3))),
    Right(Mul(Add(Lit(1), Lit(2)), Lit(3))))
  Judge.check("2단계 parse › 단항 마이너스")(
    (parse(List(Minus, Number(2), Star, Number(3))), parse(List(Number(3), Minus, Minus, LParen, Number(1), RParen))),
    (Right(Mul(Neg(Lit(2)), Lit(3))), Right(Sub(Lit(3), Neg(Lit(1))))))
  Judge.check("2단계 parse › 식이 끝나 버린 경우")(
    (parse(Nil), parse(List(Number(1), Plus)), parse(List(LParen))),
    (Left("식이 갑자기 끝났습니다"), Left("식이 갑자기 끝났습니다"), Left("식이 갑자기 끝났습니다")))
  Judge.check("2단계 parse › 자리에 맞지 않는 토큰")(
    (parse(List(Star, Number(1))), parse(List(Number(1), Plus, RParen)), parse(List(Number(1), Number(2))), parse(List(Number(1), RParen))),
    (Left("예상하지 못한 토큰: Star"), Left("예상하지 못한 토큰: RParen"), Left("예상하지 못한 토큰: Number(2)"), Left("예상하지 못한 토큰: RParen")))
  Judge.check("2단계 parse › 닫는 괄호 누락")(
    (parse(List(LParen, Number(1), Plus, Number(2))), parse(List(LParen, Number(1), Number(2), RParen))),
    (Left("닫는 괄호가 없습니다"), Left("닫는 괄호가 없습니다")))

  // 3단계: eval
  Judge.check("3단계 eval › 사칙연산")(
    eval(Sub(Add(Lit(2), Mul(Lit(3), Lit(4))), Neg(Lit(1)))),
    Right(15))
  Judge.check("3단계 eval › 정수 나눗셈은 0 방향으로 버린다")(
    (eval(Div(Lit(7), Lit(2))), eval(Div(Neg(Lit(7)), Lit(2)))),
    (Right(3), Right(-3)))
  Judge.check("3단계 eval › 0으로 나누기")(
    eval(Div(Lit(1), Sub(Lit(2), Lit(2)))),
    Left("0으로 나눌 수 없습니다"))
  Judge.check("3단계 eval › 깊은 곳의 오류도 위로 전파")(
    eval(Add(Lit(1), Mul(Lit(2), Div(Lit(3), Lit(0))))),
    Left("0으로 나눌 수 없습니다"))

  // 4단계: calc
  Judge.check("4단계 calc › 정상 계산")(
    (calc("12+3*(4-1)"), calc("2*(3+4)-10/5"), calc(" -(2+3) * 4 ")),
    (Right(21), Right(12), Right(-20)))
  Judge.check("4단계 calc › 토큰화 오류")(calc("2 + x"), Left("알 수 없는 문자: 'x'"))
  Judge.check("4단계 calc › 파싱 오류")(
    (calc("(1+2"), calc("1 +"), calc("")),
    (Left("닫는 괄호가 없습니다"), Left("식이 갑자기 끝났습니다"), Left("식이 갑자기 끝났습니다")))
  Judge.check("4단계 calc › 계산 오류")(calc("10/(5-5)"), Left("0으로 나눌 수 없습니다"))
