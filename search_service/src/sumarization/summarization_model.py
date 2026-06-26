import torch
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM

class SummarizationService:
    def __init__(self):
        self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
        self.model_name = "facebook/bart-large-cnn"
        self.tokenizer = None
        self.model = None

    def load_model(self):
        if self.model is None:
            self.model = AutoModelForSeq2SeqLM.from_pretrained(self.model_name)
            self.model.to(self.device)

        if self.tokenizer is None:
            self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)

    def summarize(self, text: str) -> str:
        if len(text) <= 50: 
            return text

        if self.model is None or self.tokenizer is None:
            self.load_model()
        
        text = text[:4000]
        inputs = self.tokenizer(text, return_tensors="pt", max_length=1024, truncation=True).to(self.device)
        
        summarize_ids = self.model.generate(
                                            inputs["input_ids"], 
                                            max_length=150, 
                                            min_length=30, 
                                            length_penalty=2.0, 
                                            num_beams=4, 
                                            early_stopping=True
                                            )
        
        return self.tokenizer.decode(summarize_ids[0], skip_special_tokens=True)
    
    
    